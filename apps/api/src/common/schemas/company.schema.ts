import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ collection: "companies" })
export class Company {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  // every entry: { sourceId, sourceUrl, retrievedAt, license }
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  sources: Record<string, unknown>[];

  @Prop({ type: [String], default: [] })
  commodities: string[];

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: "Concession" }],
    default: [],
  })
  concessionIds: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  lossInsideConcessionsByYear: { year: number; ha: number }[];

  @Prop({ type: [String], default: [] })
  traseLinks: string[];
}

export const CompanySchema = SchemaFactory.createForClass(Company);
CompanySchema.index({ name: "text" });
