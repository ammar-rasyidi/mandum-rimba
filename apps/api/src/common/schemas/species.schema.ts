import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type SpeciesDocument = HydratedDocument<Species>;

/**
 * Curated reference list of flagship threatened Indonesian species. Every
 * field is a citable public fact: the IUCN Red List category and assessment
 * URL come from the species' published assessment; the GBIF taxon key is the
 * backbone identifier; habitat ecoregions name RESOLVE 2017 ecoregions the
 * species is documented to depend on. Seeded by the `species` ingest job.
 */
@Schema({ collection: "species" })
export class Species {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  scientificName: string;

  @Prop({ required: true })
  commonNameId: string;

  @Prop({ required: true })
  commonNameEn: string;

  // IUCN Red List category: CR | EN | VU (others possible)
  @Prop({ required: true })
  iucnStatus: string;

  @Prop({ required: true })
  iucnAssessmentUrl: string;

  @Prop({ required: true })
  gbifTaxonKey: number;

  // RESOLVE 2017 eco_name values this species is documented to inhabit
  @Prop({ type: [String], default: [] })
  habitatEcoregions: string[];

  @Prop({ default: "" })
  islandGroup: string;
}

export const SpeciesSchema = SchemaFactory.createForClass(Species);
