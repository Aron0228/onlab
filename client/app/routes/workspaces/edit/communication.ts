import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type WorkspaceModel from 'client/models/workspace';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import type UserModel from 'client/models/user';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';
import type ApiService from 'client/services/api';

type StoreLike = {
  findRecord(modelName: 'user', id: number): Promise<UserModel>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<ArrayLike<WorkspaceMemberModel>>;
};

export type CommunicationFile = {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
};

export type CommunicationMember = {
  id: number;
  userId: number;
  fullName: string;
  username: string;
  avatarUrl?: string;
};

export type CommunicationAttachment = {
  id: number;
  fileId: number;
  file?: CommunicationFile;
};

export type CommunicationMessage = {
  id: number;
  channelId: number;
  senderId: number;
  content?: string;
  createdAt?: string;
  attachments: CommunicationAttachment[];
};

export type CommunicationChannel = {
  id: number;
  workspaceId: number;
  type: 'DIRECT' | 'GROUP';
  name?: string;
  updatedAt?: string;
  members: { userId: number; mutedAt?: string | null }[];
  messages: CommunicationMessage[];
};

export type WorkspacesEditCommunicationRouteModel = {
  workspace: WorkspaceModel;
  members: CommunicationMember[];
  channels: CommunicationChannel[];
  selectedChannelId: number | null;
};

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null }
  >;
};

type JsonApiResourceIdentifier = {
  id: string;
  type: string;
};

type JsonApiDocument = {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
};

export default class WorkspacesEditCommunicationRoute extends Route {
  @service declare store: StoreLike;
  @service declare api: ApiService;

  queryParams = {
    channelId: {
      refreshModel: true,
    },
  };

  async model(params: {
    channelId?: string;
  }): Promise<WorkspacesEditCommunicationRouteModel> {
    const workspacesEditModel = this.modelFor(
      'workspaces.edit'
    ) as WorkspacesIssuesRouteModel;
    const workspace = workspacesEditModel.workspace;
    const workspaceId = Number(workspace.id);

    const [members, owner, channelsPayload] = await Promise.all([
      this.store.query('workspace-member', {
        filter: {
          where: { workspaceId },
          include: ['user'],
          order: ['id ASC'],
        },
      }),
      this.store.findRecord('user', workspace.ownerId),
      this.api.request(`/communication/workspaces/${workspaceId}/channels`),
    ]);
    const memberList = Array.from(members)
      .filter((member) => member.user)
      .map((member) => ({
        id: Number(member.id),
        userId: Number(member.userId),
        fullName: member.user?.fullName ?? 'Unknown user',
        username: member.user?.username ?? '',
        avatarUrl: member.user?.avatarUrl,
      }));
    const memberIds = new Set(memberList.map((member) => member.userId));

    if (!memberIds.has(Number(owner.id))) {
      memberList.unshift({
        id: Number(owner.id),
        userId: Number(owner.id),
        fullName: owner.fullName,
        username: owner.username,
        avatarUrl: owner.avatarUrl,
      });
    }

    const channels = this.parseChannels(channelsPayload);
    const requestedChannel = params.channelId
      ? channels.find((channel) => channel.id === Number(params.channelId))
      : null;

    return {
      workspace,
      members: memberList,
      channels,
      selectedChannelId: requestedChannel?.id ?? null,
    };
  }

  private parseChannels(payload: unknown): CommunicationChannel[] {
    if (Array.isArray(payload)) {
      return payload.map((resource) =>
        parseRawChannel(resource as RawCommunicationChannel)
      );
    }

    if (!isJsonApiDocument(payload)) {
      return [];
    }

    const data = Array.isArray(payload.data) ? payload.data : [payload.data];
    const included = new Map(
      (payload.included ?? []).map((resource) => [
        `${resource.type}:${resource.id}`,
        resource,
      ])
    );

    return data.filter(Boolean).map((resource) => {
      const relationships = resource.relationships ?? {};
      const memberRefs = asArray(relationships.members?.data);
      const messageRefs = asArray(relationships.messages?.data);

      return {
        id: Number(resource.id),
        workspaceId: Number(resource.attributes?.workspaceId),
        type: resource.attributes?.type as 'DIRECT' | 'GROUP',
        name: resource.attributes?.name as string | undefined,
        updatedAt: resource.attributes?.updatedAt as string | undefined,
        members: memberRefs
          .map((ref) => included.get(`${ref.type}:${ref.id}`))
          .filter(Boolean)
          .map((member) => ({
            userId: Number(member?.attributes?.userId),
            mutedAt: member?.attributes?.mutedAt as string | null | undefined,
          })),
        messages: messageRefs
          .map((ref) => included.get(`${ref.type}:${ref.id}`))
          .filter(Boolean)
          .map((message) => parseMessage(message as JsonApiResource, included)),
      };
    });
  }
}

type RawCommunicationChannel = {
  id: number;
  workspaceId: number;
  type: 'DIRECT' | 'GROUP';
  name?: string;
  updatedAt?: string;
  members?: Array<{ userId: number; mutedAt?: string | null }>;
  messages?: RawCommunicationMessage[];
};

type RawCommunicationMessage = {
  id: number;
  channelId: number;
  senderId: number;
  content?: string;
  createdAt?: string;
  attachments?: RawCommunicationAttachment[];
};

type RawCommunicationAttachment = {
  id: number;
  fileId: number;
  file?: CommunicationFile;
};

function parseRawChannel(
  resource: RawCommunicationChannel
): CommunicationChannel {
  return {
    id: Number(resource.id),
    workspaceId: Number(resource.workspaceId),
    type: resource.type,
    name: resource.name,
    updatedAt: resource.updatedAt,
    members: (resource.members ?? []).map((member) => ({
      userId: Number(member.userId),
      mutedAt: member.mutedAt,
    })),
    messages: (resource.messages ?? []).map(parseRawMessage),
  };
}

function parseRawMessage(
  resource: RawCommunicationMessage
): CommunicationMessage {
  return {
    id: Number(resource.id),
    channelId: Number(resource.channelId),
    senderId: Number(resource.senderId),
    content: resource.content,
    createdAt: resource.createdAt,
    attachments: (resource.attachments ?? []).map((attachment) => ({
      id: Number(attachment.id),
      fileId: Number(attachment.fileId),
      file: attachment.file,
    })),
  };
}

function parseMessage(
  resource: JsonApiResource,
  included: Map<string, JsonApiResource>
): CommunicationMessage {
  const attachmentRefs = asArray(resource.relationships?.attachments?.data);

  return {
    id: Number(resource.id),
    channelId: Number(resource.attributes?.channelId),
    senderId: Number(resource.attributes?.senderId),
    content: resource.attributes?.content as string | undefined,
    createdAt: resource.attributes?.createdAt as string | undefined,
    attachments: attachmentRefs
      .map((ref) => included.get(`${ref.type}:${ref.id}`))
      .filter(Boolean)
      .map((attachment) =>
        parseAttachment(attachment as JsonApiResource, included)
      ),
  };
}

function parseAttachment(
  resource: JsonApiResource,
  included: Map<string, JsonApiResource>
): CommunicationAttachment {
  const fileRef = resource.relationships?.file?.data as
    | JsonApiResourceIdentifier
    | undefined;
  const file = fileRef
    ? included.get(`${fileRef.type}:${fileRef.id}`)
    : undefined;

  return {
    id: Number(resource.id),
    fileId: Number(resource.attributes?.fileId),
    file: file
      ? {
          id: Number(file.id),
          originalName: file.attributes?.originalName as string,
          mimeType: file.attributes?.mimeType as string,
          size: Number(file.attributes?.size),
        }
      : undefined,
  };
}

function asArray(
  value?: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null
): JsonApiResourceIdentifier[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isJsonApiDocument(value: unknown): value is JsonApiDocument {
  return (
    value !== null &&
    typeof value === 'object' &&
    'data' in value &&
    (Array.isArray((value as JsonApiDocument).data) ||
      Boolean((value as JsonApiDocument).data))
  );
}
