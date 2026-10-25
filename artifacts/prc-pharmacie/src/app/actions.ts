import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getChangePasswordMutationOptions,
  getCloseLaunchMutationOptions,
  getCreateInvitationMutationOptions,
  getCreateLaunchMutationOptions,
  getCreatePrcMutationOptions,
  getCreateTeacherMutationOptions,
  getGenerateReferenceMutationOptions,
  getJoinLaunchMutationOptions,
  getLoginMutationOptions,
  getLogoutMutationOptions,
  getPublishResultsMutationOptions,
  getRevealLaunchMutationOptions,
  getSaveParticipantResponseMutationOptions,
  getSubmitParticipantResponseMutationOptions,
  getUpdatePrcMutationOptions,
  getUpdateTeacherMutationOptions,
  getValidateReferenceMutationOptions,
  getGetCurrentUserQueryKey,
  getGetLaunchQueryKey,
  getGetPrcQueryKey,
  getGetWorkspaceSummaryQueryKey,
  getListPrcsQueryKey,
  getListTeachersQueryKey,
} from "@workspace/api-client-react";
export type AppActions = ReturnType<typeof useActions>;
export function useActions() {
  const qc = useQueryClient();
  const refresh = (key: readonly unknown[]) =>
    qc.invalidateQueries({ queryKey: key });
  return {
    login: useMutation(
      getLoginMutationOptions({
        mutation: { onSuccess: () => refresh(getGetCurrentUserQueryKey()) },
      }),
    ),
    logout: useMutation(
      getLogoutMutationOptions({
        mutation: {
          onSuccess: () => {
            const currentUserKey = getGetCurrentUserQueryKey();
            qc.setQueryData(currentUserKey, null);
            qc.removeQueries({
              predicate: (query) => query.queryKey[0] !== currentUserKey[0],
            });
          },
        },
      }),
    ),
    password: useMutation(
      getChangePasswordMutationOptions({
        mutation: {
          onSuccess: () => {
            refresh(getGetCurrentUserQueryKey());
            refresh(getGetWorkspaceSummaryQueryKey());
            refresh(getListPrcsQueryKey());
          },
        },
      }),
    ),
    createTeacher: useMutation(
      getCreateTeacherMutationOptions({
        mutation: { onSuccess: () => refresh(getListTeachersQueryKey()) },
      }),
    ),
    updateTeacher: useMutation(
      getUpdateTeacherMutationOptions({
        mutation: { onSuccess: () => refresh(getListTeachersQueryKey()) },
      }),
    ),
    createPrc: useMutation(
      getCreatePrcMutationOptions({
        mutation: {
          onSuccess: () => {
            refresh(getListPrcsQueryKey());
            refresh(getGetWorkspaceSummaryQueryKey());
          },
        },
      }),
    ),
    updatePrc: useMutation(
      getUpdatePrcMutationOptions({
        mutation: {
          onSuccess: (_res, vars) => {
            refresh(getGetPrcQueryKey(vars.prcId));
            refresh(getListPrcsQueryKey());
          },
        },
      }),
    ),
    createLaunch: useMutation(
      getCreateLaunchMutationOptions({
        mutation: {
          onSuccess: () => {
            refresh(getListPrcsQueryKey());
            refresh(getGetWorkspaceSummaryQueryKey());
          },
        },
      }),
    ),
    invitation: useMutation(getCreateInvitationMutationOptions()),
    join: useMutation(getJoinLaunchMutationOptions()),
    saveResponse: useMutation(getSaveParticipantResponseMutationOptions()),
    submitResponse: useMutation(getSubmitParticipantResponseMutationOptions()),
    closeLaunch: useMutation(
      getCloseLaunchMutationOptions({
        mutation: {
          onSuccess: (_res, vars) =>
            refresh(getGetLaunchQueryKey(vars.launchId)),
        },
      }),
    ),
    reveal: useMutation(
      getRevealLaunchMutationOptions({
        mutation: {
          onSuccess: (_res, vars) =>
            refresh(getGetLaunchQueryKey(vars.launchId)),
        },
      }),
    ),
    generateReference: useMutation(getGenerateReferenceMutationOptions()),
    validateReference: useMutation(getValidateReferenceMutationOptions()),
    publishResults: useMutation(
      getPublishResultsMutationOptions({
        mutation: {
          onSuccess: (_res, vars) =>
            refresh(getGetLaunchQueryKey(vars.launchId)),
        },
      }),
    ),
  };
}
