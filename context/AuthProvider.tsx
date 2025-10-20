import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { User, AuthenticatedUser, TeacherUser, StudentUser, Student } from '../types';
import * as dataService from '../services/dataService';

interface AuthContextType {
  currentUser: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string) => Promise<TeacherUser | null>;
  signup: (name: string, email: string) => Promise<TeacherUser | null>;
  studentLogin: (firstName: string, lastName: string, dob: string) => Promise<StudentUser | null>;
  signInWithGoogle: () => Promise<TeacherUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        try {
            // Check for student session first
            const studentSession = dataService.getCurrentStudentSession();
            if (studentSession) {
                const students = dataService.getStudents(studentSession.teacherId);
                const student = students.find(s => s.id === studentSession.studentId);
                if (student) {
                    setCurrentUser({ role: 'student', student, teacherId: studentSession.teacherId });
                    setLoading(false);
                    return;
                }
            }

            // Fallback to teacher session
            const teacherId = dataService.getCurrentTeacherId();
            if (teacherId) {
                const user = dataService.findUserById(teacherId);
                if (user) {
                    setCurrentUser({ ...user, role: 'teacher' });
                }
            }
        } catch (error) {
            console.error("Failed to load user session:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const login = useCallback(async (email: string): Promise<TeacherUser | null> => {
        const user = dataService.findUserByEmail(email);
        if (user) {
            dataService.setCurrentTeacherId(user.id);
            const teacherUser: TeacherUser = { ...user, role: 'teacher' };
            setCurrentUser(teacherUser);
            return teacherUser;
        }
        return null;
    }, []);

    const signup = useCallback(async (name: string, email: string): Promise<TeacherUser | null> => {
        const existingUser = dataService.findUserByEmail(email);
        if (existingUser) {
            return null; // User already exists
        }
        const newUser = dataService.createUser(name, email);
        dataService.setCurrentTeacherId(newUser.id);
        const teacherUser: TeacherUser = { ...newUser, role: 'teacher' };
        setCurrentUser(teacherUser);
        return teacherUser;
    }, []);

    const studentLogin = useCallback(async (firstName: string, lastName: string, dob: string): Promise<StudentUser | null> => {
        const result = dataService.findStudentByNameAndDob(firstName, lastName, dob);
        if (result) {
            const { student, teacherId } = result;
            dataService.setCurrentStudentSession(teacherId, student.id);
            const studentUser: StudentUser = { role: 'student', student, teacherId };
            setCurrentUser(studentUser);
            return studentUser;
        }
        return null;
    }, []);


    const signInWithGoogle = useCallback(async (): Promise<TeacherUser> => {
        // This is a simulated Google Sign-In for demo purposes
        let googleUser = dataService.findUserByEmail('demo@google.com');
        if (!googleUser) {
            const users = dataService.getUsers();
            googleUser = { id: 'google-demo-user', name: 'Demo Teacher', email: 'demo@google.com', provider: 'google' };
            dataService.saveUsers([...users, googleUser]);
        }
        dataService.setCurrentTeacherId(googleUser.id);
        const teacherUser: TeacherUser = { ...googleUser, role: 'teacher' };
        setCurrentUser(teacherUser);
        return teacherUser;
    }, []);

    const logout = useCallback(() => {
        dataService.clearCurrentSession();
        setCurrentUser(null);
    }, []);

    const value = { currentUser, loading, login, signup, studentLogin, signInWithGoogle, logout };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};