import Brand, {
  type BrandDocument,
  type IBrand,
} from "./models/brand.schema.js";

type Query = Record<string, any>;

export const findAll = async (query: Query, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [brands, total] = await Promise.all([
    Brand.find(query).sort({ _id: -1 }).skip(skip).limit(limit).populate("supplierId").lean(),
    Brand.countDocuments(query),
  ]);
  
  const totalPages = Math.ceil(total / limit);

  return { brands: brands as any[], total, limit, page, totalPages };
};

export const countAll = (query: Query) => Brand.countDocuments(query);

export const findById = (id: string) => Brand.findById(id).populate("supplierId");

export const findBySlug = (slug: string) => Brand.findOne({ slug });

export const findOneBy = (query: Query) => Brand.findOne(query);

export const create = (data: Partial<IBrand>) => Brand.create(data);

export const save = (brand: BrandDocument) => brand.save();

export const deleteById = (id: string) => Brand.findByIdAndDelete(id);
