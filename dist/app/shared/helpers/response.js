/**
 * Tách `message` ra top-level, phần còn lại vào `data`.
 * Controllers không cần đổi — chỉ pass object bình thường.
 *
 * Ví dụ:
 *   response.success(res, { user, token })
 *   → { success: true, data: { user, token } }
 *
 *   response.success(res, { message: "OK", user })
 *   → { success: true, message: "OK", data: { user } }
 */
const shape = (payload) => {
    if (Array.isArray(payload)) {
        return {
            success: true,
            data: payload,
        };
    }
    const { message, ...data } = payload;
    return {
        success: true,
        ...(message !== undefined ? { message } : {}),
        data,
    };
};
/** 200 OK */
export const success = (res, payload = {}) => res.status(200).json(shape(payload));
/** 201 Created */
export const created = (res, payload = {}) => res.status(201).json(shape(payload));
/** 204 No Content */
export const noContent = (res) => res.status(204).send();
