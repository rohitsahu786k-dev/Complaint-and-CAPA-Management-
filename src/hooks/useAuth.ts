import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiUser } from "@shared/types/api";
import type { LoginInput } from "@shared/schemas/auth";
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
