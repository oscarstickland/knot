import type { CurrentUserData } from "@knot/backend/auth";
import { createContext, useContext, useEffect, useState } from "react"
import { Outlet } from "react-router";
import useSWR, { type KeyedMutator } from "swr";

enum AuthStatus {
    LOADING = "loading",
    UNAUTHENTICATED = "unauth",
    AUTHENTICATED = "auth"
}

type OptionalAuthMutator = { mutator: KeyedMutator<CurrentUserData> | null };

type AuthState = 
    | { status: AuthStatus.LOADING } & OptionalAuthMutator
    | { status: AuthStatus.UNAUTHENTICATED } & OptionalAuthMutator
    | { status: AuthStatus.AUTHENTICATED; user: CurrentUserData } & OptionalAuthMutator;

const AuthContext = createContext<AuthState>({ status: AuthStatus.LOADING, mutator: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const {data, isLoading, error, mutate } = useSWR<CurrentUserData>("/user/me");

    let authState: AuthState;
    if (isLoading) {
        authState = { status: AuthStatus.LOADING, mutator: mutate }
    } else if (error || !data) {
        authState = { status: AuthStatus.UNAUTHENTICATED, mutator: mutate }
    } else {
        authState = { status: AuthStatus.AUTHENTICATED, user: data, mutator: mutate }
    }

    return (
        <AuthContext.Provider value={authState}>
            {children}
        </AuthContext.Provider>
    )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
    const status = useContext(AuthContext);

    if (status.status == AuthStatus.LOADING) return <p>Loading</p>
    else if (status.status == AuthStatus.UNAUTHENTICATED) return <p>Unauthenticated</p>
    else return <>{ children }</>
}

export function useUser() {
    const status = useContext(AuthContext);

    if (status.status != AuthStatus.AUTHENTICATED) 
        throw Error("User should be authenticated before using this hook.")

    return status.user;
}

export function useUserMutate() {
    const status = useContext(AuthContext);
    return status.mutator;
}