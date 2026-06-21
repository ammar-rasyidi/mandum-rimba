import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type SpeciesOccurrenceDocument = HydratedDocument<SpeciesOccurrence>;

/**
 * Georeferenced occurrence records from GBIF, "this species was recorded
 * here", NOT a habitat boundary. Provenance is kept per record (basisOfRecord
 * + dataset + license) so the UI can disclose exactly where each point came
 * from. iucnStatus is denormalized from the species reference so the map tile
 * can be filtered by conservation status without a join.
 */
@Schema({ collection: "speciesOccurrences" })
export class SpeciesOccurrence {
  @Prop({ required: true })
  speciesSlug: string;

  @Prop({ required: true })
  scientificName: string;

  @Prop({ required: true })
  iucnStatus: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  geom: { type: "Point"; coordinates: [number, number] };

  @Prop({ type: Number, default: null })
  year: number | null;

  // PRESERVED_SPECIMEN | HUMAN_OBSERVATION | MACHINE_OBSERVATION | ...
  @Prop({ default: "" })
  basisOfRecord: string;

  @Prop({ default: "" })
  datasetKey: string;

  @Prop({ default: "" })
  license: string;

  @Prop({ required: true })
  gbifId: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true })
  retrievedAt: Date;
}

export const SpeciesOccurrenceSchema =
  SchemaFactory.createForClass(SpeciesOccurrence);
SpeciesOccurrenceSchema.index({ geom: "2dsphere" });
SpeciesOccurrenceSchema.index({ gbifId: 1 }, { unique: true });
SpeciesOccurrenceSchema.index({ speciesSlug: 1 });
