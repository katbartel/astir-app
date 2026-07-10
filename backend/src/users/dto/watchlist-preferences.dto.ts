import { Transform } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator'

const trimList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== '')
    : value

function StringList(): PropertyDecorator {
  return (target, propertyKey) => {
    Transform(trimList)(target, propertyKey)
    IsArray()(target, propertyKey)
    IsString({ each: true })(target, propertyKey)
    MaxLength(80, { each: true })(target, propertyKey)
    ArrayMaxSize(50)(target, propertyKey)
  }
}

export class WatchlistPreferencesDto {
  @StringList()
  keywords!: string[]

  @StringList()
  excludedKeywords!: string[]

  @StringList()
  workModes!: string[]

  @StringList()
  contractTypes!: string[]

  @StringList()
  terms!: string[]

  @StringList()
  languages!: string[]

  @StringList()
  industryNoGos!: string[]

  @StringList()
  hiringRegions!: string[]
}
