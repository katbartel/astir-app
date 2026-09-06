import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateWatchlistCompanyDto,
  UpdateWatchlistListingStatusDto,
  UpdateWatchlistCompanyDto,
} from './dto/watchlist-company.dto'
import { WatchlistCompanyView, WatchlistService } from './watchlist.service'

@UseGuards(JwtAuthGuard)
@Controller('watchlist/companies')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  list(@CurrentUser() authUser: AuthenticatedUser): Promise<WatchlistCompanyView[]> {
    return this.watchlistService.list(authUser.userId)
  }

  @Post()
  add(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() body: CreateWatchlistCompanyDto,
  ): Promise<WatchlistCompanyView> {
    return this.watchlistService.add(authUser.userId, body)
  }

  @Patch(':id')
  update(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateWatchlistCompanyDto,
  ): Promise<WatchlistCompanyView> {
    return this.watchlistService.update(authUser.userId, id, body)
  }

  @Post(':id/resolve')
  resolve(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<WatchlistCompanyView> {
    return this.watchlistService.resolve(authUser.userId, id)
  }

  @Patch('listings/:id')
  @HttpCode(204)
  async updateListing(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateWatchlistListingStatusDto,
  ): Promise<void> {
    await this.watchlistService.setListingStatus(authUser.userId, id, body.status)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.watchlistService.remove(authUser.userId, id)
  }
}
