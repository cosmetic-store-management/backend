import { injectable } from "tsyringe";
import Brand, { type BrandDocument, type IBrand } from "./models/brand.schema.js";

type Query = Record<string, any>;

@injectable()
export class BrandRepository {
  async findAll(query: Query, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [brands, total] = await Promise.all([
      Brand.find(query).sort({ _id: -1 }).skip(skip).limit(limit).populate("supplierId").lean(),
      Brand.countDocuments(query),
    ]);
    
    const totalPages = Math.ceil(total / limit);
    return { brands: brands as any[], total, limit, page, totalPages };
  }

  countAll(query: Query) {
    return Brand.countDocuments(query);
  }

  findById(id: string) {
    return Brand.findById(id).populate("supplierId");
  }

  findBySlug(slug: string) {
    return Brand.findOne({ slug });
  }

  findOneBy(query: Query) {
    return Brand.findOne(query);
  }

  create(data: Partial<IBrand>) {
    return Brand.create(data);
  }

  save(brand: BrandDocument) {
    return brand.save();
  }

  deleteById(id: string) {
    return Brand.findByIdAndDelete(id);
  }

  countBySupplierId(supplierId: string, isActive?: boolean) {
    const query: any = { supplierId };
    if (isActive !== undefined) {
      query.isActive = isActive;
    }
    return Brand.countDocuments(query);
  }

  updateSupplierInfo(supplierId: string, data: { supplierName: string, contactPhone?: string, contactEmail?: string }) {
    return Brand.updateMany(
      { supplierId },
      { $set: data }
    );
  }

  updateById(id: string, data: any) {
    return Brand.findByIdAndUpdate(id, data, { new: true });
  }

  async findIdsBySlugs(slugs: string[]): Promise<string[]> {
    const brands = await Brand.find({ slug: { $in: slugs } }).select("_id").lean();
    return brands.map((b: any) => b._id.toString());
  }
}
