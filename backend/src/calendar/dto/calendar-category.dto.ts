import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'

export class SaveCalendarCategoryDto {
  @IsIn(['interview', 'coffee'])
  kind!: 'interview' | 'coffee'

  @IsOptional()
  @IsString()
  @MinLength(1)
  applicationId?: string
}
