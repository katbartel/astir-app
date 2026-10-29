import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { ApplicationsModule } from './applications/applications.module'
import { CalendarModule } from './calendar/calendar.module'
import { AuthModule } from './auth/auth.module'
import { ConfigModule } from './config/config.module'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { JobBoardsModule } from './job-boards/job-boards.module'
import { RemoteCompaniesModule } from './remote-companies/remote-companies.module'
import { UsersModule } from './users/users.module'
import { WatchlistModule } from './watchlist/watchlist.module'

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ScheduleModule.forRoot(),
    JobBoardsModule,
    WatchlistModule,
    RemoteCompaniesModule,
    ApplicationsModule,
    CalendarModule,
  ],
})
export class AppModule {}
