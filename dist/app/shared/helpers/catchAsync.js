/**
 * catchAsync — Wrap async route handler để tự động forward error sang next().
 * Tránh phải try/catch ở mỗi controller.
 */
export const catchAsync = (fn) => (req, res, next) => {
    fn(req, res, next).catch(next);
};
