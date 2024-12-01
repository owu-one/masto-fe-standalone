import api, {
  apiRequest,
  getLinks,
  apiRequestGet,
  apiRequestPost,
} from 'flavours/glitch/api';
import type {
  ApiNotificationGroupsResultJSON,
  ApiNotificationRequestJSON,
  ApiNotificationJSON,
  ApiNotificationGroupJSON,
} from 'flavours/glitch/api_types/notifications';

import type { ApiAccountJSON } from 'flavours/glitch/api_types/accounts';
import type { ApiStatusJSON } from 'flavours/glitch/api_types/statuses';

// add a helper function to convert v1 response to v2 format
function convertV1ToV2Format(notifications: ApiNotificationJSON[]) {
  const accounts = new Map<string, ApiAccountJSON>();
  const statuses = new Map<string, ApiStatusJSON>();
  const groups = new Map<string, ApiNotificationGroupJSON>();

  notifications.forEach(notification => {
    // collect accounts
    accounts.set(notification.account.id, notification.account);
    if ('status' in notification && notification.status) {
      statuses.set(notification.status.id, notification.status);
      
      // generate group key based on notification type and status ID
      const groupKey = `${notification.type}-${notification.status.id}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          group_key: groupKey,
          notifications_count: 1,
          type: notification.type,
          most_recent_notification_id: notification.id,
          page_min_id: notification.id,
          page_max_id: notification.id,
          latest_page_notification_at: notification.created_at,
          sample_account_ids: [notification.account.id],
          status_id: notification.status.id,
        });
      } else {
        const group = groups.get(groupKey)!;
        group.notifications_count++;
        group.sample_account_ids.push(notification.account.id);
        
        // update time range
        if (notification.created_at > group.latest_page_notification_at) {
          group.latest_page_notification_at = notification.created_at;
          group.page_max_id = notification.id;
        }
        if (typeof group.page_min_id !== 'undefined' && notification.id < group.page_min_id) {
          group.page_min_id = notification.id;
        }
      }
    }
  });

  return {
    accounts: Array.from(accounts.values()),
    statuses: Array.from(statuses.values()),
    notification_groups: Array.from(groups.values()),
  };
}

export const apiFetchNotifications = async (
  params?: {
    account_id?: string;
    since_id?: string;
  },
  url?: string,
) => {
  const response = await api().request<ApiNotificationJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/notifications',
    params,
  });

  return {
    notifications: response.data,
    links: getLinks(response),
  };
};

export const apiFetchNotificationGroups = async (params?: {
  url?: string;
  grouped_types?: string[];
  exclude_types?: string[];
  max_id?: string;
  since_id?: string;
}) => {
  try {
    // try v2 API first
    const response = await api().request<ApiNotificationGroupsResultJSON>({
      method: 'GET',
      url: '/api/v2/notifications',
      params,
    });

    return {
      statuses: response.data.statuses,
      accounts: response.data.accounts,
      notifications: response.data.notification_groups,
      links: getLinks(response),
    };
  } catch (error: any) {
    // fallback to v1 API if 404 or 501
    if (error?.response?.status === 404 || error?.response?.status === 501) {
      const v1Response = await api().request<ApiNotificationJSON[]>({
        method: 'GET',
        url: '/api/v1/notifications',
        params: {
          exclude_types: params?.exclude_types,
          max_id: params?.max_id,
          since_id: params?.since_id,
        },
      });

      const v2Format = convertV1ToV2Format(v1Response.data);

      return {
        statuses: v2Format.statuses,
        accounts: v2Format.accounts,
        notifications: v2Format.notification_groups,
        links: getLinks(v1Response),
      };
    }
    
    throw error;
  }
};

export const apiClearNotifications = () =>
  apiRequest<undefined>('POST', 'v1/notifications/clear');

export const apiFetchNotificationRequests = async (
  params?: {
    since_id?: string;
  },
  url?: string,
) => {
  const response = await api().request<ApiNotificationRequestJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/notifications/requests',
    params,
  });

  return {
    requests: response.data,
    links: getLinks(response),
  };
};

export const apiFetchNotificationRequest = async (id: string) => {
  return apiRequestGet<ApiNotificationRequestJSON>(
    `v1/notifications/requests/${id}`,
  );
};

export const apiAcceptNotificationRequest = async (id: string) => {
  return apiRequestPost(`v1/notifications/requests/${id}/accept`);
};

export const apiDismissNotificationRequest = async (id: string) => {
  return apiRequestPost(`v1/notifications/requests/${id}/dismiss`);
};

export const apiAcceptNotificationRequests = async (id: string[]) => {
  return apiRequestPost('v1/notifications/requests/accept', { id });
};

export const apiDismissNotificationRequests = async (id: string[]) => {
  return apiRequestPost('v1/notifications/requests/dismiss', { id });
};
