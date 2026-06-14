import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type RegionDocument = HydratedDocument<Region>;

@Schema({ collection: "regions" })
export class Region {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  nameEn: string;

  @Prop({ required: true, enum: ["province", "kabupaten"] })
  level: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Region", default: null })
  parentId: MongooseSchema.Types.ObjectId | null;

  @Prop({ default: "" })
  islandGroup: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  geomSimplified: Record<string, unknown>;
}

export const RegionSchema = SchemaFactory.createForClass(Region);
RegionSchema.index({ geom: "2dsphere" });
RegionSchema.index({ level: 1 });
RegionSchema.index({ name: "text", nameEn: "text" });
