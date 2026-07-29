import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

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

// One block of the rich-text note: a run of text, a checkbox, or a container
// (quote / collapse) holding nested blocks.
class NoteBlockDto {
  @IsIn(['text', 'check', 'quote', 'collapse'])
  type!: 'text' | 'check' | 'quote' | 'collapse'

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string

  @IsOptional()
  @IsBoolean()
  checked?: boolean

  @IsOptional()
  @IsBoolean()
  bold?: boolean

  @IsOptional()
  @IsBoolean()
  italic?: boolean

  @IsOptional()
  @IsBoolean()
  underline?: boolean

  @IsOptional()
  @IsBoolean()
  strike?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  href?: string

  // Collapse (toggle section) title.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string

  // Collapse open/closed state.
  @IsOptional()
  @IsBoolean()
  open?: boolean

  // Nested blocks for quote/collapse containers.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteBlockDto)
  blocks?: NoteBlockDto[]
}

class NoteDto {
  @IsOptional()
  @IsString()
  kind?: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteBlockDto)
  blocks?: NoteBlockDto[]
}

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
  @ValidateNested()
  @Type(() => NoteDto)
  note?: NoteDto
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
  @ValidateNested()
  @Type(() => NoteDto)
  note?: NoteDto
}
