import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

// Kept in sync with the client's statusOptions. "Applied" and "Closed" sit
// outside the active pipeline; the stages between them show on Pipeline.
export const STATUS_OPTIONS = [
  'Applied',
  '1st stage',
  '2nd stage',
  '3rd stage',
  'Offer',
  'Hired',
  'Closed',
] as const

export const STAGE_IDS = [
  'applied',
  'progress-1',
  'progress-2',
  'progress-3',
  'offer',
  'hired',
  'closed',
] as const

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

// The note is stored opaquely. It is a v2 envelope `{ v, kind, doc }`, or a v1
// note during the mixed-version window, and the editor's document is the source
// of truth: the load path (readNote) validates and migrates it. So the API
// persists the JSON verbatim rather than modelling it here.
//
// Modelling only the v1 shape (kind/text/blocks) is exactly what broke: under
// `whitelist: true` the ValidationPipe stripped every property not on the DTO,
// so a v2 note lost its `v` and `doc` and was saved as `{ kind: 'blocks' }`. A
// passthrough object keeps the whole envelope. `@IsObject` refuses a string or
// array; the shape itself is the read path's job, not the wire's.

export class CreateApplicationDto {
  @IsOptional()
  @IsString()
  listingId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  company!: string

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  role!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  link?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stageId?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  status?: string

  @Matches(DATE_KEY, { message: 'appliedDate must be a YYYY-MM-DD date key' })
  appliedDate!: string

  @IsOptional()
  @IsObject()
  note?: Record<string, unknown>
}

export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  company?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  role?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  link?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stageId?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  status?: string

  @IsOptional()
  @Matches(DATE_KEY, { message: 'appliedDate must be a YYYY-MM-DD date key' })
  appliedDate?: string

  @IsOptional()
  @IsObject()
  note?: Record<string, unknown>
}
