import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Story, StoryDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";

@Controller("stories")
@UseInterceptors(CacheHeaderInterceptor)
export class StoriesController {
  constructor(
    @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
  ) {}

  @Get()
  async list() {
    return this.storyModel
      .find({ publishedAt: { $ne: null } })
      .select("-bodyMdxId -bodyMdxEn")
      .sort({ publishedAt: -1 });
  }

  @Get(":slug")
  async get(@Param("slug") slug: string) {
    const story = await this.storyModel.findOne({
      slug,
      publishedAt: { $ne: null },
    });
    if (!story) throw new NotFoundException();
    return story;
  }
}
