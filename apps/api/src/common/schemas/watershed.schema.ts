import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type WatershedDocument = HydratedDocument<Watershed>;

@Schema({ collection: "watersheds" })
export class Watershed {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  basinLevel: number;

  @Prop({ required: true, unique: true })
  hybasId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: Record<string, unknown>;
}

export const WatershedSchema = SchemaFactory.createForClass(Watershed);
WatershedSchema.index({ geom: "2dsphere" });
