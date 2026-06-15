import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Loading from './components/loading';
import { PATHS } from './constants/paths';
import { routerConfig } from './constants/routerConfig';
import MainLayout from './layouts/mainLayout/MainLayout';
import ForgotPassword from './pages/login/ForgotPassword';
import Login from './pages/login/index';
import NotFound from './pages/errors/NotFound';
import Register from './pages/register';
import { useAuthStore } from './store/authStore';

function PrivateRoute() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  if (!isAuthenticated) {
    return <Navigate to={PATHS.LOGIN} replace />;
  }

  if (location.pathname === '/' || location.pathname === '') {
    return <Navigate to={PATHS.HOME} />;
  }

  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.VITE_PROD ? '/app' : ''}>
      <Routes>
        <Route path="/" element={<PrivateRoute />}>
          <Route path="/" element={<MainLayout />}>
            {routerConfig.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <Suspense fallback={<Loading />}>
                    <route.component />
                  </Suspense>
                }
              />
            ))}
          </Route>
        </Route>
        <Route path={PATHS.LOGIN} element={<Login />} />
        <Route path={PATHS.REGISTER} element={<Register />} />
        <Route path={PATHS.FORGOT_PASSWORD} element={<ForgotPassword />} />
        <Route path={PATHS.ERROR_404} element={<NotFound />} />
        <Route path={PATHS.ANY} element={<Navigate to={PATHS.ERROR_404} />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;
