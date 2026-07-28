import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateRemoteCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  careersUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  companyWebsite?: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string
}

// Edit an existing company: both fields optional so the admin can change just
// the name, URLs, note, or a combination. Empty optional fields clear their values.
export class UpdateRemoteCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  careersUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  companyWebsite?: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string
}

// Bulk paste: one company per line. Each line is either a bare name
// ("GitLab") or "Name, https://careers-url" — the careers URL is optional and
// split on the first comma so company names containing commas still work when
// no URL is given.
export class BulkRemoteCompanyDto {
  @IsString()
  @MaxLength(100_000)
  text!: string
}
