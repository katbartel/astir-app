import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../database/prisma.service'
import { CalendarTokenCipher } from './calendar-token-cipher'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
}

type GoogleEvent = {
  id?: string
  status?: string
  summary?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  attendees?: Array<{ self?: boolean; responseStatus?: string }>
}

export type CalendarEventView = {
  id: string
  title: string
  start: string
  end: string
  kind?: 'interview' | 'coffee'
  applicationId?: string
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cipher: CalendarTokenCipher,
  ) {}

  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID') || '',
      redirect_uri: this.config.get<string>('GOOGLE_CALENDAR_CALLBACK_URL') || '',
      response_type: 'code',
      scope: CALENDAR_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async connect(userId: string, code: string): Promise<void> {
    const token = await this.exchangeCode(code)
    if (!token.refresh_token) {
      throw new BadGatewayException('Google did not provide a calendar connection token. Please try again.')
    }
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null
    await this.prisma.calendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        refreshTokenEncrypted: this.cipher.encrypt(token.refresh_token),
        accessTokenEncrypted: token.access_token ? this.cipher.encrypt(token.access_token) : null,
        accessTokenExpiresAt: expiresAt,
      },
      update: {
        refreshTokenEncrypted: this.cipher.encrypt(token.refresh_token),
        accessTokenEncrypted: token.access_token ? this.cipher.encrypt(token.access_token) : null,
        accessTokenExpiresAt: expiresAt,
      },
    })
  }

  async upcoming(userId: string): Promise<{ connected: boolean; events: CalendarEventView[] }> {
    const connection = await this.prisma.calendarConnection.findUnique({ where: { userId } })
    if (!connection) return { connected: false, events: [] }

    const accessToken = await this.accessToken(connection)
    const now = new Date()
    const upperBound = new Date(now.getTime() + THIRTY_DAYS_MS)
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: upperBound.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      eventTypes: 'default',
    })
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!response.ok) throw new BadGatewayException('Calendar events could not be loaded. Please reconnect your calendar.')
    const payload = (await response.json()) as { items?: GoogleEvent[] }
    const events = (payload.items ?? [])
      .filter((event) => this.isMeeting(event))
      .map((event) => ({
        id: event.id as string,
        title: event.summary?.trim() || 'Untitled meeting',
        start: event.start?.dateTime as string,
        end: event.end?.dateTime as string,
      }))
    const categories = events.length
      ? await this.prisma.calendarEventCategory.findMany({
          where: { userId, calendarEventId: { in: events.map((event) => event.id) } },
        })
      : []
    const categoryByEventId = new Map(categories.map((category) => [category.calendarEventId, category]))
    return {
      connected: true,
      events: events.map((event) => {
        const category = categoryByEventId.get(event.id)
        return category
          ? { ...event, kind: category.kind as 'interview' | 'coffee', applicationId: category.applicationId ?? undefined }
          : event
      }),
    }
  }

  async saveCategory(
    userId: string,
    calendarEventId: string,
    kind: 'interview' | 'coffee',
    applicationId?: string,
  ): Promise<void> {
    if (kind === 'interview' && !applicationId) {
      throw new BadRequestException('Choose a pipeline company for an interview.')
    }
    if (applicationId) {
      const application = await this.prisma.application.findFirst({ where: { id: applicationId, userId } })
      if (!application) throw new NotFoundException('Application not found')
    }
    await this.prisma.calendarEventCategory.upsert({
      where: { userId_calendarEventId: { userId, calendarEventId } },
      create: { userId, calendarEventId, kind, applicationId: kind === 'interview' ? applicationId : null },
      update: { kind, applicationId: kind === 'interview' ? applicationId : null },
    })
  }

  async removeCategory(userId: string, calendarEventId: string): Promise<void> {
    await this.prisma.calendarEventCategory.deleteMany({ where: { userId, calendarEventId } })
  }

  private isMeeting(event: GoogleEvent): boolean {
    if (!event.id || event.status === 'cancelled' || !event.start?.dateTime || !event.end?.dateTime) return false
    // Calendar providers sometimes book an interview through a meeting link
    // without adding the interviewer as an attendee. Keep every timed event,
    // except one the signed-in person explicitly declined.
    return !event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === 'declined')
  }

  private async accessToken(connection: {
    refreshTokenEncrypted: string
    accessTokenEncrypted: string | null
    accessTokenExpiresAt: Date | null
    userId: string
  }): Promise<string> {
    if (connection.accessTokenEncrypted && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > new Date()) {
      return this.cipher.decrypt(connection.accessTokenEncrypted)
    }
    const token = await this.refreshAccessToken(this.cipher.decrypt(connection.refreshTokenEncrypted))
    if (!token.access_token) throw new BadGatewayException('Calendar access could not be refreshed. Please reconnect your calendar.')
    await this.prisma.calendarConnection.update({
      where: { userId: connection.userId },
      data: {
        accessTokenEncrypted: this.cipher.encrypt(token.access_token),
        accessTokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      },
    })
    return token.access_token
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.get<string>('GOOGLE_CALENDAR_CALLBACK_URL') || '',
    })
  }

  private async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
  }

  private async tokenRequest(values: Record<string, string>): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      ...values,
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID') || '',
      client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') || '',
    })
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) throw new BadGatewayException('Calendar connection could not be completed. Please try again.')
    return response.json() as Promise<GoogleTokenResponse>
  }
}
