import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type StoryDocument = HydratedDocument<Story>;

@Schema({ collection: "stories" })
export class Story {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  titleId: string;

  @Prop({ required: true })
  titleEn: string;

  @Prop({ default: "" })
  bodyMdxId: string;

  @Prop({ default: "" })
  bodyMdxEn: string;

  @Prop({ type: String, default: null })
  heroBeforeImg: string | null;

  @Prop({ type: String, default: null })
  heroAfterImg: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  mapState: Record<string, unknown> | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  sources: Record<string, unknown>[];
}

export const StorySchema = SchemaFactory.createForClass(Story);
StorySchema.index({ titleId: "text", titleEn: "text" });
