import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { CalendarController } from './calendar.controller'
import { CalendarService } from './calendar.service'
import { CalendarTokenCipher } from './calendar-token-cipher'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-only-jwt-secret',
      }),
    }),
  ],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarTokenCipher],
})
export class CalendarModule {}
