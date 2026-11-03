package com.example.patterns.gateway;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Instant;
import java.util.Map;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * DEMO ONLY token issuer so the sample runs without an identity provider.
 * In production issue tokens from Keycloak / Okta / Entra ID and keep only the resource-server config here.
 */
@RestController
class TokenController {

    record Login(String username, String password) {}

    private final JwtEncoder encoder;

    TokenController(SecretKeySpec jwtKey) {
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
    }

    @PostMapping("/auth/token")
    Map<String, Object> token(@RequestBody Login login) {
        if (!"demo".equals(login.username()) || !"demo".equals(login.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bad credentials");
        }
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(login.username()).issuedAt(now).expiresAt(now.plusSeconds(3600)).claim("scope", "orders").build();
        String jwt = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return Map.of("access_token", jwt, "token_type", "Bearer", "expires_in", 3600);
    }
}
