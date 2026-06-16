import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type ProtectedAreaDocument = HydratedDocument<ProtectedArea>;

/**
 * Protected (WDPA) and moratorium (KLHK PIPPIB) polygons, shown as the
 * "protected & moratorium" map layer.
 */
@Schema({ collection: "protectedAreas" })
export class ProtectedArea {
  @Prop({ required: true, enum: ["protected", "moratorium"] })
  kind: string;

  /**
   * Conservation category, drives the map sub-filter:
   *   TN  = Taman Nasional (National Park)
   *   HL  = Hutan Lindung (Protected Forest)
   *   CA  = Cagar Alam (Strict Nature Reserve)
   *   SM  = Suaka Margasatwa (Wildlife Reserve)
   *   KK  = Kawasan konservasi lain (TWA, Tahura, Taman Buru, …)
   *   moratorium = KLHK PIPPIB moratorium polygons
   */
  @Prop({
    required: true,
    enum: ["TN", "HL", "CA", "SM", "KK", "moratorium"],
  })
  category: string;

  /** primary name (WDPA name_eng — the recognizable/gazetted name) */
  @Prop({ required: true })
  name: string;

  /** alternate WDPA name (the `name` field) when it differs from `name` above */
  @Prop({ default: "" })
  nameAlt: string;

  /** raw WDPA designation, Indonesian (e.g. "Taman Nasional") */
  @Prop({ default: "" })
  desig: string;

  /** raw WDPA designation, English (e.g. "National Park") */
  @Prop({ default: "" })
  desigEng: string;

  /** IUCN management category (Ia, Ib, II, …, VI, or "Not Reported") */
  @Prop({ default: "" })
  iucnCat: string;

  /** area in hectares (GFW-computed gfw_area__ha) */
  @Prop({ default: 0 })
  areaHa: number;

  /** year of designation (WDPA status_yr; 0 = unknown) */
  @Prop({ default: 0 })
  statusYear: number;

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
ProtectedAreaSchema.index({ category: 1 });
