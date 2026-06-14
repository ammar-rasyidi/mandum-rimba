import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type DerivedDiscrepancyDocument = HydratedDocument<DerivedDiscrepancy>;

@Schema({ collection: "derivedDiscrepancies" })
export class DerivedDiscrepancy {
  @Prop({
    required: true,
    enum: [
      "clearing_outside_concession",
      "clearing_in_protected",
      "clearing_in_moratorium",
      "flood_downstream_of_loss",
    ],
  })
  kind: string;

  @Prop({ default: 0 })
  alertCount: number;

  @Prop({ default: 0 })
  areaHa: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Region", required: true })
  regionId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Concession",
    default: null,
  })
  concessionId: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Watershed",
    default: null,
  })
  watershedId: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Disaster",
    default: null,
  })
  disasterId: MongooseSchema.Types.ObjectId | null;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({ required: true })
  methodologyVersion: string;

  @Prop({ required: true })
  computedAt: Date;

  // extra evidence for flood_downstream_of_loss: upstream loss summed per year
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  evidence: Record<string, unknown> | null;
}

export const DerivedDiscrepancySchema =
  SchemaFactory.createForClass(DerivedDiscrepancy);
DerivedDiscrepancySchema.index({ kind: 1, regionId: 1 });
DerivedDiscrepancySchema.index(
  { kind: 1, regionId: 1, concessionId: 1, disasterId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true },
);
