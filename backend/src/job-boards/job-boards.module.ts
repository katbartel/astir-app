import { Module } from '@nestjs/common'
import { CompanyResolutionService } from './company-resolution.service'
import { JobBoardsController } from './job-boards.controller'
import { JobBoardsService } from './job-boards.service'
import { JobIngestionService } from './job-ingestion.service'
import { JobMatchingService } from './job-matching.service'
import { AdzunaProvider } from './providers/adzuna.provider'
import { ArbeitnowProvider } from './providers/arbeitnow.provider'
import { AshbyProvider } from './providers/ashby.provider'
import { BambooHrProvider } from './providers/bamboohr.provider'
import { BlueskyProvider } from './providers/bluesky.provider'
import { BreezyProvider } from './providers/breezy.provider'
import { GreenhouseProvider } from './providers/greenhouse.provider'
import { JOB_BOARD_PROVIDERS } from './providers/job-board-provider'
import { JoinProvider } from './providers/join.provider'
import { JobPostingProvider } from './providers/jobposting.provider'
import { LeverProvider } from './providers/lever.provider'
import { PersonioProvider } from './providers/personio.provider'
import { PinpointProvider } from './providers/pinpoint.provider'
import { RecruiteeProvider } from './providers/recruitee.provider'
import { SmartRecruitersProvider } from './providers/smartrecruiters.provider'
import { TeamtailorProvider } from './providers/teamtailor.provider'
import { TheMuseProvider } from './providers/themuse.provider'
import { TraffitProvider } from './providers/traffit.provider'
import { WorkableProvider } from './providers/workable.provider'
import { WorkdayProvider } from './providers/workday.provider'
import { ScrapingFallbackService } from './scraping-fallback.service'

// To support a new job board API: implement JobBoardProvider (ATS or
// aggregator), list the class here, and add it to the JOB_BOARD_PROVIDERS
// factory below.
@Module({
  controllers: [JobBoardsController],
  providers: [
    GreenhouseProvider,
    AshbyProvider,
    WorkableProvider,
    LeverProvider,
    SmartRecruitersProvider,
    RecruiteeProvider,
    TeamtailorProvider,
    PersonioProvider,
    JoinProvider,
    WorkdayProvider,
    TraffitProvider,
    BambooHrProvider,
    PinpointProvider,
    BreezyProvider,
    BlueskyProvider,
    JobPostingProvider,
    ArbeitnowProvider,
    TheMuseProvider,
    AdzunaProvider,
    {
      provide: JOB_BOARD_PROVIDERS,
      useFactory: (
        greenhouse: GreenhouseProvider,
        ashby: AshbyProvider,
        workable: WorkableProvider,
        lever: LeverProvider,
        smartRecruiters: SmartRecruitersProvider,
        recruitee: RecruiteeProvider,
        teamtailor: TeamtailorProvider,
        personio: PersonioProvider,
        join: JoinProvider,
        workday: WorkdayProvider,
        traffit: TraffitProvider,
        bamboohr: BambooHrProvider,
        pinpoint: PinpointProvider,
        breezy: BreezyProvider,
        bluesky: BlueskyProvider,
        // Generic schema.org reader last: it only runs as a resolution fallback.
        jobPosting: JobPostingProvider,
        arbeitnow: ArbeitnowProvider,
        theMuse: TheMuseProvider,
        adzuna: AdzunaProvider,
      ) => [
        greenhouse,
        ashby,
        workable,
        lever,
        smartRecruiters,
        recruitee,
        teamtailor,
        personio,
        join,
        workday,
        traffit,
        bamboohr,
        pinpoint,
        breezy,
        bluesky,
        jobPosting,
        arbeitnow,
        theMuse,
        adzuna,
      ],
      inject: [
        GreenhouseProvider,
        AshbyProvider,
        WorkableProvider,
        LeverProvider,
        SmartRecruitersProvider,
        RecruiteeProvider,
        TeamtailorProvider,
        PersonioProvider,
        JoinProvider,
        WorkdayProvider,
        TraffitProvider,
        BambooHrProvider,
        PinpointProvider,
        BreezyProvider,
        BlueskyProvider,
        JobPostingProvider,
        ArbeitnowProvider,
        TheMuseProvider,
        AdzunaProvider,
      ],
    },
    CompanyResolutionService,
    JobIngestionService,
    JobMatchingService,
    JobBoardsService,
    ScrapingFallbackService,
  ],
  exports: [CompanyResolutionService, JobIngestionService, JobMatchingService],
})
export class JobBoardsModule {}
