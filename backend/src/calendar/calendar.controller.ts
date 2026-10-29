import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query, Res, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Response } from 'express'
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CalendarService, CalendarEventView } from './calendar.service'
import { SaveCalendarCategoryDto } from './dto/calendar-category.dto'

type CalendarState = { purpose: 'calendar-connection'; sub: string }

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  async connect(@CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    const state = await this.jwt.signAsync({ purpose: 'calendar-connection', sub: user.userId }, { expiresIn: '10m' })
    response.redirect(this.calendar.authorizationUrl(state))
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const returnUrl = new URL('/', this.config.get<string>('FRONTEND_ORIGIN') || 'http://localhost:5173')
    try {
      if (!code || !state) throw new Error('Missing Google callback values')
      const payload = await this.jwt.verifyAsync<CalendarState>(state)
      if (payload.purpose !== 'calendar-connection' || !payload.sub) throw new Error('Invalid calendar state')
      await this.calendar.connect(payload.sub, code)
      returnUrl.searchParams.set('calendar', 'connected')
    } catch {
      returnUrl.searchParams.set('calendar', 'error')
    }
    response.redirect(returnUrl.toString())
  }

  @UseGuards(JwtAuthGuard)
  @Get('events')
  upcoming(@CurrentUser() user: AuthenticatedUser): Promise<{ connected: boolean; events: CalendarEventView[] }> {
    return this.calendar.upcoming(user.userId)
  }

  @UseGuards(JwtAuthGuard)
  @Put('events/:eventId/category')
  @HttpCode(204)
  async saveCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Body() body: SaveCalendarCategoryDto,
  ): Promise<void> {
    await this.calendar.saveCategory(user.userId, eventId, body.kind, body.applicationId)
  }

  @UseGuards(JwtAuthGuard)
  @Delete('events/:eventId/category')
  @HttpCode(204)
  async removeCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ): Promise<void> {
    await this.calendar.removeCategory(user.userId, eventId)
  }
}
