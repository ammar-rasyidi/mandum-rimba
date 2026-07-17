import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type WetlandDocument = HydratedDocument<Wetland>;

/**
 * Wetland habitat extents that share one shape (polygons) but come from
 * different sources: `mangrove` (Global Mangrove Watch) and `peatland` (KLHK
 * peat hydrological units). One collection, one tile per `kind`.
 */
@Schema({ collection: "wetlands" })
export class Wetland {
  @Prop({ required: true, enum: ["mangrove", "peatland"] })
  kind: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  sourceRef: string;

  @Prop({ type: String, default: null })
  name: string | null;

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

export const WetlandSchema = SchemaFactory.createForClass(Wetland);
WetlandSchema.index({ geom: "2dsphere" });
WetlandSchema.index({ kind: 1 });
WetlandSchema.index({ source: 1, sourceRef: 1 }, { unique: true });
