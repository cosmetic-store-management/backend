import * as attrRepo from "./attribute.repository.js";
import { mapAttribute } from "./dto/attribute.response.dto.js";
import { notFound, conflict } from "../../shared/errors/httpErrors.js";
export const getAllAttributes = async () => {
    const attrs = await attrRepo.findAll({}, 0, 100);
    return attrs.map(mapAttribute);
};
export const getAttributeDetail = async (id) => {
    const attr = await attrRepo.findById(id);
    if (!attr)
        throw notFound("Không tìm thấy thuộc tính");
    return mapAttribute(attr);
};
export const createAttribute = async (data) => {
    const existing = await attrRepo.findByCode(data.code);
    if (existing)
        throw conflict("Mã code thuộc tính đã tồn tại");
    const newAttr = await attrRepo.create(data);
    return mapAttribute(newAttr);
};
export const updateAttribute = async (id, data) => {
    const attr = await attrRepo.findById(id);
    if (!attr)
        throw notFound("Không tìm thấy thuộc tính");
    if (data.name !== undefined)
        attr.name = data.name;
    if (data.values !== undefined)
        attr.values = data.values;
    await attrRepo.save(attr);
    return mapAttribute(attr);
};
export const deleteAttribute = async (id) => {
    const attr = await attrRepo.findById(id);
    if (!attr)
        throw notFound("Không tìm thấy thuộc tính");
    await attrRepo.deleteById(id);
};
