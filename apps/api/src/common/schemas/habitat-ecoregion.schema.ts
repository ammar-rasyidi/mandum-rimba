import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type HabitatEcoregionDocument = HydratedDocument<HabitatEcoregion>;

/**
 * RESOLVE Ecoregions 2017 (Dinerstein et al., BioScience) polygons, limited to
 * the ecoregions that are documented habitat of our flagship species. These
 * are scientifically-recognized habitat *units*, served openly by UNEP-WCMC
 * (CC BY 4.0), presented as "habitat ecoregion", explicitly not a precise
 * per-individual range.
 */
@Schema({ collection: "habitatEcoregions" })
export class HabitatEcoregion {
  @Prop({ required: true, unique: true })
  ecoName: string;

  @Prop({ default: "" })
  biomeName: string;

  @Prop({ default: "" })
  realm: string;

  @Prop({ type: Number, default: null })
  ecoId: number | null;

  // flagship species slugs documented to inhabit this ecoregion
  @Prop({ type: [String], default: [] })
  speciesSlugs: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: Record<string, unknown>;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true })
  retrievedAt: Date;

  @Prop({ default: "CC BY 4.0" })
  license: string;
}

export const HabitatEcoregionSchema =
  SchemaFactory.createForClass(HabitatEcoregion);
// NO 2dsphere index: habitat polygons are only tiled, never spatially queried,
// and RESOLVE's simplified rings fail 2dsphere's strict validity checks.
