import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiUser } from "@shared/types/api";
import type { ChangePasswordInput, LoginInput } from "@shared/schemas/auth";
import { api } from "@/lib/api";

type MeResponse = { user: ApiUser };

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<MeResponse>("/api/auth/me"),
    retry: false
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<MeResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: (data) => queryClient.setQueryData(["auth", "me"], data)
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => queryClient.removeQueries({ queryKey: ["auth"] })
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api<{ changed: boolean }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: async () => {
      // ProtectedRoute gates every route on this cached flag. Clearing it up front stops
      // a post-change redirect from being bounced straight back to /profile while the
      // refetch is still in flight.
      queryClient.setQueryData<MeResponse>(["auth", "me"], (previous) =>
        previous ? { ...previous, user: { ...previous.user, forcePasswordChange: false } } : previous
      );
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });
}
