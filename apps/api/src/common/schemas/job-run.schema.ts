import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export type JobRunDocument = HydratedDocument<JobRun>;

@Schema({ collection: "jobRuns" })
export class JobRun {
  @Prop({ required: true })
  job: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  finishedAt: Date | null;

  @Prop({ required: true, enum: ["running", "success", "failed", "skipped"] })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  stats: Record<string, number>;

  @Prop({ type: String, default: null })
  error: string | null;
}

export const JobRunSchema = SchemaFactory.createForClass(JobRun);
JobRunSchema.index({ job: 1, startedAt: -1 });
JobRunSchema.index({ job: 1, status: 1 });
