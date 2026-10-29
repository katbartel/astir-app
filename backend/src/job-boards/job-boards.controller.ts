import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AdminGuard } from '../auth/admin.guard'
import { UpdateListingStatusDto } from './dto/update-listing.dto'
import { JobIngestionService, SyncSummary } from './job-ingestion.service'
import { JobBoardsService, JobBoardListing } from './job-boards.service'
import { JobQualityOverview, JobQualityService } from './job-quality.service'

@UseGuards(JwtAuthGuard)
@Controller('job-boards')
export class JobBoardsController {
  constructor(
    private readonly jobBoardsService: JobBoardsService,
    private readonly jobIngestionService: JobIngestionService,
    private readonly jobQuality: JobQualityService,
  ) {}

  @Get('listings')
  getListings(@CurrentUser() authUser: AuthenticatedUser): Promise<JobBoardListing[]> {
    return this.jobBoardsService.listForUser(authUser.userId)
  }

  // Mark a listing irrelevant (drops it to the quiet section) or bring it back
  // to the main feed ({ status: 'new' }). It is never deleted, so it can be
  // restored later.
  @Patch('listings/:id')
  @HttpCode(204)
  async updateListing(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateListingStatusDto,
  ): Promise<void> {
    await this.jobBoardsService.setStatus(authUser.userId, id, body.status)
  }

  // Manual refresh; the hourly cron does the same in the background.
  @Post('sync')
  triggerSync(): Promise<SyncSummary> {
    return this.jobIngestionService.syncAll()
  }

  @UseGuards(AdminGuard)
  @Get('quality')
  quality(): Promise<JobQualityOverview> {
    return this.jobQuality.overview()
  }
}
