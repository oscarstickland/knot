import type { CurrentUserData } from "@knot/backend/auth";
import { createContext, useContext, useEffect, useState } from "react"
import { Outlet } from "react-router";
import useSWR from "swr";

enum AuthStatus {
    LOADING = "loading",
    UNAUTHENTICATED = "unauth",
    AUTHENTICATED = "auth"
}

type AuthState = 
    | { status: AuthStatus.LOADING }
    | { status: AuthStatus.UNAUTHENTICATED }
    | { status: AuthStatus.AUTHENTICATED; user: CurrentUserData };

const AuthContext = createContext<AuthState>({ status: AuthStatus.LOADING });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const {data, isLoading, error} = useSWR<CurrentUserData>("/user/me");

    let authState: AuthState;
    if (isLoading) {
        authState = { status: AuthStatus.LOADING }
    } else if (error || !data) {
        authState = { status: AuthStatus.UNAUTHENTICATED }
    } else {
        authState = { status: AuthStatus.AUTHENTICATED, user: data }
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