import { IsBoolean, IsString, IsOptional, IsInt, IsArray, Min, MinLength, MaxLength, Matches, ArrayMaxSize } from 'class-validator';
export class LocalCnDto {
  @IsString()
  @MinLength(1,{message:'请填写标题'})
  @MaxLength(100)
  title: string;
  @IsBoolean({message:'请明确选择是否使用 AI'})
  useAI: boolean;
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
export class XiaohongshuDto extends LocalCnDto {
  @MaxLength(20,{message:'小红书标题最多 20 字'})
  title: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({each:true})
  @MaxLength(30,{each:true})
  topics?: string[];
}
export class FanqieDto extends LocalCnDto {
  @IsString()
  @Matches(/^\d+$/,{message:'请选择目标作品'})
  bookId: string;
  @IsInt({message:'章节序号必须是整数'})
  @Min(1,{message:'章节序号从 1 开始'})
  chapterNumber: number;
}
