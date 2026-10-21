import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export function useAuthSession() {
  const [session, setSession] = useState(undefined); // undefined = aún cargando
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setLoginError(err.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : err.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return { session, email, setEmail, password, setPassword, loginError, loggingIn, handleLogin, handleLogout };
}
