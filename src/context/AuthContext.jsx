import React, { createContext, useContext, useState } from 'react'
import * as authClient from '../api/apiClient'
import { migrateLegacyData } from '../utils/legacyMigration'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
    const [status, setStatus] = useState('unauthenticated')

    const login = async (email, password) => {
        const result = await authClient.login(email, password)
        setStatus('authenticated')
        await migrateLegacyData()
        return result
    }

    const signup = async (email, password) => {
        const result = await authClient.signup(email, password)
        setStatus('authenticated')
        await migrateLegacyData()
        return result
    }

    // C20 -- Logout control: revokes the session server-side, then transitions
    // this context's state to 'unauthenticated' so every consumer (LogoutButton
    // included) re-renders as logged out without needing its own status wiring.
    const logout = async () => {
        await authClient.logout()
        setStatus('unauthenticated')
    }

    return (
        <AuthContext.Provider value={{ status, setStatus, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return ctx
}
