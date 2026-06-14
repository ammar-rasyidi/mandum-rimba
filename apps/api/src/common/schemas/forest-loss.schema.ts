import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type ForestLossAnnualDocument = HydratedDocument<ForestLossAnnual>;

@Schema({ collection: "forestLossAnnual" })
export class ForestLossAnnual {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Region", required: true })
  regionId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  year: number;

  @Prop({ required: true })
  lossHa: number;

  @Prop({ type: Number, default: null })
  primaryLossHa: number | null;

  @Prop({ required: true })
  source: string;
}

export const ForestLossAnnualSchema =
  SchemaFactory.createForClass(ForestLossAnnual);
ForestLossAnnualSchema.index({ regionId: 1, year: 1 }, { unique: true });
