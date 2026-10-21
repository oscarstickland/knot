import type { CurrentUserData, SessionUserData, SuperAdminUserData } from "@knot/backend/auth";
import { createContext, useContext } from "react"
import { Navigate } from "react-router";
import useSWR, { type KeyedMutator } from "swr";

enum AuthStatus {
    LOADING = "loading",
    UNAUTHENTICATED = "unauth",
    AUTHENTICATED = "auth"
}

type OptionalAuthMutator = { mutator: KeyedMutator<SessionUserData> | null };

type AuthState = 
    | { status: AuthStatus.LOADING } & OptionalAuthMutator
    | { status: AuthStatus.UNAUTHENTICATED } & OptionalAuthMutator
    | { status: AuthStatus.AUTHENTICATED; user: SessionUserData } & OptionalAuthMutator;

const AuthContext = createContext<AuthState>({ status: AuthStatus.LOADING, mutator: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const {data, isLoading, error, mutate } = useSWR<SessionUserData>("/user/me");

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

// Where each kind of account lives. Super admins only ever see the platform view.
export function homePathFor(user: SessionUserData) {
    return user.role === "superadmin" ? "/super" : "/app";
}

export function RequireAuth({ children, area }: { children: React.ReactNode, area: "club" | "superadmin" }) {
    const status = useContext(AuthContext);

    if (status.status == AuthStatus.LOADING) return <p>Loading</p>
    else if (status.status == AuthStatus.UNAUTHENTICATED) return <p>Unauthenticated</p>

    // Wrong area for this account - send them home rather than rendering a view they can't use
    const isSuperAdmin = status.user.role === "superadmin";
    if (isSuperAdmin !== (area === "superadmin")) return <Navigate to={homePathFor(status.user)} replace />

    return <>{ children }</>
}

function useSessionUser() {
    const status = useContext(AuthContext);

    if (status.status != AuthStatus.AUTHENTICATED) 
        throw Error("User should be authenticated before using this hook.")

    return status.user;
}

// Club member. Only valid beneath <RequireAuth area="club">.
export function useUser(): CurrentUserData {
    const user = useSessionUser();
    if (user.role === "superadmin") throw Error("Super admins have no club; use useSuperAdmin instead.");
    return user;
}

// Only valid beneath <RequireAuth area="superadmin">.
export function useSuperAdmin(): SuperAdminUserData {
    const user = useSessionUser();
    if (user.role !== "superadmin") throw Error("User is not a super admin.");
    return user;
}

export function useUserMutate() {
    const status = useContext(AuthContext);
    return status.mutator;
}