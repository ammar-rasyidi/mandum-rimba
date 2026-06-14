import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type ConcessionDocument = HydratedDocument<Concession>;

@Schema({ collection: "concessions" })
export class Concession {
  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  sourceRef: string;

  @Prop({ required: true })
  companyName: string;

  @Prop({ required: true })
  companySlug: string;

  @Prop({ required: true, enum: ["palm_hgu", "pulp_hti", "logging", "mining"] })
  type: string;

  @Prop({ type: String, default: null })
  commodity: string | null;

  @Prop({ type: String, default: null })
  permitStatus: string | null;

  @Prop({ type: Number, default: null })
  permitYear: number | null;

  @Prop({ default: 0 })
  areaHa: number;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: Record<string, unknown>;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true })
  retrievedAt: Date;

  @Prop({ default: "unknown" })
  license: string;
}

export const ConcessionSchema = SchemaFactory.createForClass(Concession);
ConcessionSchema.index({ geom: "2dsphere" });
ConcessionSchema.index({ type: 1, commodity: 1, companySlug: 1 });
ConcessionSchema.index({ source: 1, sourceRef: 1 }, { unique: true });
