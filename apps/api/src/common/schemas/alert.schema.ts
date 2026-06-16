import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type AlertDocument = HydratedDocument<Alert>;

@Schema({ collection: "alerts" })
export class Alert {
  @Prop({ required: true })
  alertDate: Date;

  @Prop({ required: true, enum: ["radd", "glad_l", "glad_s2"] })
  system: string;

  @Prop({ default: "nominal" })
  confidence: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: { type: "Point"; coordinates: [number, number] };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Region", default: null })
  regionId: MongooseSchema.Types.ObjectId | null;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
AlertSchema.index({ geom: "2dsphere" });
AlertSchema.index({ alertDate: 1, system: 1 });
// dedupe key: one alert per system per pixel per day
AlertSchema.index(
  { system: 1, alertDate: 1, "geom.coordinates": 1 },
  { unique: true },
);
