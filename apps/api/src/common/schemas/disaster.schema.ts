import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type DisasterDocument = HydratedDocument<Disaster>;

@Schema({ collection: "disasters" })
export class Disaster {
  @Prop({ required: true })
  eventDate: Date;

  @Prop({ required: true, enum: ["flood", "landslide", "flash_flood", "other"] })
  type: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Region", default: null })
  regionId: MongooseSchema.Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  deaths: number | null;

  @Prop({ type: Number, default: null })
  affected: number | null;

  @Prop({ default: "" })
  description: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true })
  sourceRef: string;

  @Prop({ required: true })
  retrievedAt: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  geom: { type: "Point"; coordinates: [number, number] } | null;
}

export const DisasterSchema = SchemaFactory.createForClass(Disaster);
DisasterSchema.index({ eventDate: 1, type: 1 });
DisasterSchema.index({ sourceRef: 1 }, { unique: true });
DisasterSchema.index({ geom: "2dsphere" }, { sparse: true });
