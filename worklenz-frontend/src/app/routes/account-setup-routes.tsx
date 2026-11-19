import { RouteObject, Navigate } from 'react-router-dom';

const accountSetupRoute: RouteObject = {
  path: '/alpha/setup',
  element: <Navigate to="/alpha/home" replace />,
};

export default accountSetupRoute;
