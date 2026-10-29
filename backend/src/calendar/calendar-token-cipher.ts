import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Calendar refresh tokens are credentials, not profile data. Keep their
// encrypted representation self-contained so a later key-rotation migration
// can recognise the version before decrypting it.
@Injectable()
export class CalendarTokenCipher {
  private readonly key: Buffer

  constructor(config: ConfigService) {
    const configured = config.get<string>('CALENDAR_TOKEN_ENCRYPTION_KEY')
    const jwtSecret = config.get<string>('JWT_SECRET')
    if (!configured && config.get<string>('NODE_ENV') === 'production') {
      throw new InternalServerErrorException('Calendar token encryption is not configured')
    }
    this.key = createHash('sha256').update(configured || jwtSecret || 'dev-only-jwt-secret').digest()
  }

  encrypt(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
  }

  decrypt(value: string): string {
    const [version, ivValue, tagValue, ciphertextValue] = value.split('.')
    if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
      throw new InternalServerErrorException('Calendar connection could not be read')
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'))
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw new InternalServerErrorException('Calendar connection could not be read')
    }
  }
}
