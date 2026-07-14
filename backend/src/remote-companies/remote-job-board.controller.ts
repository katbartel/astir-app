import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common'
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { UpdateListingStatusDto } from '../job-boards/dto/update-listing.dto'
import { RemoteJobBoardListing, RemoteJobBoardService } from './remote-job-board.service'

// Visible to every authenticated user (unlike the admin-only curation
// endpoints): the Remote Job Board is a normal feed, just sourced from the
// curated remote-company list.
@UseGuards(JwtAuthGuard)
@Controller('remote-job-board')
export class RemoteJobBoardController {
  constructor(private readonly remoteJobBoard: RemoteJobBoardService) {}

  @Get('listings')
  getListings(@CurrentUser() authUser: AuthenticatedUser): Promise<RemoteJobBoardListing[]> {
    return this.remoteJobBoard.listForUser(authUser.userId)
  }

  // Mark a listing irrelevant (drops it to the quiet section) or bring it back
  // to the main feed ({ status: 'new' }). It is never deleted, so it can be
  // restored later. Mirrors the regular Job Board's PATCH.
  @Patch('listings/:id')
  @HttpCode(204)
  async updateListing(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateListingStatusDto,
  ): Promise<void> {
    await this.remoteJobBoard.setStatus(authUser.userId, id, body.status)
  }
}
