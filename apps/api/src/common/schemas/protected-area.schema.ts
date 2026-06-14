import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type ProtectedAreaDocument = HydratedDocument<ProtectedArea>;

/**
 * Protected (WDPA) and moratorium (KLHK PIPPIB) polygons. Not in the original
 * collection list but required by the spatialFlags derive job to set
 * insideProtected / insideMoratorium on alerts.
 */
@Schema({ collection: "protectedAreas" })
export class ProtectedArea {
  @Prop({ required: true, enum: ["protected", "moratorium"] })
  kind: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  sourceRef: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true })
  retrievedAt: Date;

  @Prop({ default: "unknown" })
  license: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: Record<string, unknown>;
}

export const ProtectedAreaSchema = SchemaFactory.createForClass(ProtectedArea);
ProtectedAreaSchema.index({ geom: "2dsphere" });
ProtectedAreaSchema.index({ source: 1, sourceRef: 1 }, { unique: true });
ProtectedAreaSchema.index({ kind: 1 });
