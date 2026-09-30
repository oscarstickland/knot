import { notification } from "antd";

export function useAppNotification() {
    return notification.useNotification({ placement: "bottomRight" });
}