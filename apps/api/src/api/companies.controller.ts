import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";
import { clampLimit } from "./query.util";

@Controller("companies")
@UseInterceptors(CacheHeaderInterceptor)
export class CompaniesController {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}

  @Get()
  async list(@Query("q") q?: string, @Query("limit") limit?: string) {
    const filter: Record<string, unknown> = {};
    if (q) filter.$text = { $search: q };
    return this.companyModel
      .find(filter)
      .sort({ name: 1 })
      .limit(clampLimit(limit, 200));
  }

  @Get(":slug")
  async get(@Param("slug") slug: string) {
    const company = await this.companyModel
      .findOne({ slug })
      .populate(
        "concessionIds",
        "companyName type commodity areaHa permitStatus permitYear source sourceUrl retrievedAt license",
      );
    if (!company) throw new NotFoundException();
    return company;
  }
}
