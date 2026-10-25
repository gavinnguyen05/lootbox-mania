"use client";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <div className="page login">
      <h1 className="page-title">Admin sign in</h1>
      <form action={action} className="login-form">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  );
}
