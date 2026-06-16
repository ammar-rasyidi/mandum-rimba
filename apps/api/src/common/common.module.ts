import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Alert,
  AlertSchema,
  Company,
  CompanySchema,
  Concession,
  ConcessionSchema,
  Disaster,
  DisasterSchema,
  ForestLossAnnual,
  ForestLossAnnualSchema,
  HabitatEcoregion,
  HabitatEcoregionSchema,
  JobRun,
  JobRunSchema,
  ProtectedArea,
  ProtectedAreaSchema,
  Region,
  RegionSchema,
  Species,
  SpeciesSchema,
  SpeciesOccurrence,
  SpeciesOccurrenceSchema,
  Story,
  StorySchema,
  Watershed,
  WatershedSchema,
} from "./schemas";
import { JobLockService } from "./job-lock.service";
import { ArchiverService } from "./archiver.service";
import { HttpService } from "./http.service";
import { JobRegistryService } from "./job-registry.service";

const models = MongooseModule.forFeature([
  { name: Region.name, schema: RegionSchema },
  { name: Concession.name, schema: ConcessionSchema },
  { name: ForestLossAnnual.name, schema: ForestLossAnnualSchema },
  { name: Alert.name, schema: AlertSchema },
  { name: Disaster.name, schema: DisasterSchema },
  { name: Watershed.name, schema: WatershedSchema },
  { name: Company.name, schema: CompanySchema },
  { name: Story.name, schema: StorySchema },
  { name: JobRun.name, schema: JobRunSchema },
  { name: ProtectedArea.name, schema: ProtectedAreaSchema },
  { name: Species.name, schema: SpeciesSchema },
  { name: SpeciesOccurrence.name, schema: SpeciesOccurrenceSchema },
  { name: HabitatEcoregion.name, schema: HabitatEcoregionSchema },
]);

@Global()
@Module({
  imports: [models],
  providers: [JobLockService, ArchiverService, HttpService, JobRegistryService],
  exports: [
    models,
    JobLockService,
    ArchiverService,
    HttpService,
    JobRegistryService,
  ],
})
export class CommonModule {}
