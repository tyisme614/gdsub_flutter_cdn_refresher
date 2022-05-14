// Copyright 2019 The Flutter team. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localized_locales/flutter_localized_locales.dart';
import 'package:dashboard/data/gallery_options.dart';
import 'package:dashboard/layout/letter_spacing.dart';
import 'package:dashboard/studies/rally/colors.dart';
import 'package:dashboard/studies/rally/home.dart';
import 'package:dashboard/studies/rally/login.dart';
import 'package:dashboard/studies/rally/routes.dart' as routes;
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter/scheduler.dart' show timeDilation;
import 'package:flutter/foundation.dart';
import 'package:dashboard/themes/gallery_theme_data.dart';

/// The RallyApp is a MaterialApp with a theme and 2 routes.
///
/// The home route is the main page with tabs for sub pages.
/// The login route is the initial route.
class RallyApp extends StatelessWidget {
  const RallyApp({Key? key}) : super(key: key);

  static const String loginRoute = routes.loginRoute;
  static const String homeRoute = routes.homeRoute;

  final double systemTextScaleFactorOption = -1;
  final sharedZAxisTransitionBuilder = const SharedAxisPageTransitionsBuilder(
    fillColor: RallyColors.primaryBackground,
    transitionType: SharedAxisTransitionType.scaled,
  );

  @override
  Widget build(BuildContext context){
    return ModelBinding(
      initialModel: GalleryOptions(
        themeMode: ThemeMode.system,
        textScaleFactor: systemTextScaleFactorOption,
        customTextDirection: CustomTextDirection.localeBased,
        locale: null,
        timeDilation: timeDilation,
        platform: defaultTargetPlatform,
        isTestMode: false,
      ),
      child: Builder(
        builder: (context) {
            return MaterialApp(
              restorationScopeId: 'rally_app',
              title: 'Rally',
              debugShowCheckedModeBanner: false,
              theme: _buildRallyTheme().copyWith(
                platform: GalleryOptions.of(context).platform,
                pageTransitionsTheme: PageTransitionsTheme(
                  builders: {
                    for (var type in TargetPlatform.values)
                      type: sharedZAxisTransitionBuilder,
                  },
                ),
              ),
              localizationsDelegates: const [LocaleNamesLocalizationsDelegate()],
              locale: GalleryOptions.of(context).locale,
              localeListResolutionCallback: (locales, supportedLocales) {
                deviceLocale = locales?.first;
                return basicLocaleListResolution(locales, supportedLocales);
              },
              initialRoute: loginRoute,
              routes: <String, WidgetBuilder>{
                homeRoute: (context) => const HomePage(),
                loginRoute: (context) => const LoginPage(),
              },
            );
        },
      ),
    );
  }

  // @override
  // Widget build(BuildContext context) {
  //   print('check gallery options-->' + GalleryOptions);
  //
  //   return MaterialApp(
  //     restorationScopeId: 'rally_app',
  //     title: 'Rally',
  //     debugShowCheckedModeBanner: false,
  //     theme: _buildRallyTheme().copyWith(
  //       platform: GalleryOptions.of(context).platform,
  //       pageTransitionsTheme: PageTransitionsTheme(
  //         builders: {
  //           for (var type in TargetPlatform.values)
  //             type: sharedZAxisTransitionBuilder,
  //         },
  //       ),
  //     ),
  //     locale: GalleryOptions.of(context).locale,
  //     initialRoute: loginRoute,
  //     routes: <String, WidgetBuilder>{
  //       homeRoute: (context) => const HomePage(),
  //       loginRoute: (context) => const LoginPage(),
  //     },
  //   );
  // }

  ThemeData _buildRallyTheme() {
    final base = ThemeData.dark();
    return ThemeData(
      appBarTheme: const AppBarTheme(
        systemOverlayStyle: SystemUiOverlayStyle.light,
        backgroundColor: RallyColors.primaryBackground,
        elevation: 0,
      ),
      scaffoldBackgroundColor: RallyColors.primaryBackground,
      primaryColor: RallyColors.primaryBackground,
      focusColor: RallyColors.focusColor,
      textTheme: _buildRallyTextTheme(base.textTheme),
      inputDecorationTheme: const InputDecorationTheme(
        labelStyle: TextStyle(
          color: RallyColors.gray,
          fontWeight: FontWeight.w500,
        ),
        filled: true,
        fillColor: RallyColors.inputBackground,
        focusedBorder: InputBorder.none,
      ),
      visualDensity: VisualDensity.standard,
    );
  }

  TextTheme _buildRallyTextTheme(TextTheme base) {
    return base
        .copyWith(
          bodyText2: GoogleFonts.robotoCondensed(
            fontSize: 14,
            fontWeight: FontWeight.w400,
            letterSpacing: letterSpacingOrNone(0.5),
          ),
          bodyText1: GoogleFonts.eczar(
            fontSize: 40,
            fontWeight: FontWeight.w400,
            letterSpacing: letterSpacingOrNone(1.4),
          ),
          button: GoogleFonts.robotoCondensed(
            fontWeight: FontWeight.w700,
            letterSpacing: letterSpacingOrNone(2.8),
          ),
          headline5: GoogleFonts.eczar(
            fontSize: 40,
            fontWeight: FontWeight.w600,
            letterSpacing: letterSpacingOrNone(1.4),
          ),
        )
        .apply(
          displayColor: Colors.white,
          bodyColor: Colors.white,
        );
  }
}
